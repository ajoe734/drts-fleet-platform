import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CANONICAL_IDS } from "@drts/contracts";

const CONTRACTS_DIR = path.resolve(__dirname, "../../packages/contracts/src");

/**
 * Matches a field declaration, not any mention. The registry below names each
 * field as a string literal, so a bare substring search would find `callPointId`
 * in the very entry recording that no field exists -- a test that passes because
 * of itself.
 */
function declaresField(source: string, field: string): boolean {
  return new RegExp(`^\\s*${field}\\??\\s*:`, "m").test(source);
}

function contractsSource(): string {
  return readdirSync(CONTRACTS_DIR)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => readFileSync(path.join(CONTRACTS_DIR, file), "utf8"))
    .join("\n");
}

describe("canonical identifiers", () => {
  it("names every identifier the service contracts declare", () => {
    // phase1_service_contracts_v1.md section 2.1 lists eighteen.
    expect(CANONICAL_IDS).toHaveLength(18);
    expect(new Set(CANONICAL_IDS.map((entry) => entry.id)).size).toBe(18);
  });

  it("carries a field in this package for every identifier in use", () => {
    // The property the specification asserted in prose, checkable. It was true
    // of seventeen of the eighteen, and establishing that took reading the
    // whole file by hand.
    const source = contractsSource();
    const missing = CANONICAL_IDS.filter(
      (entry) =>
        entry.status === "in_use" && !declaresField(source, entry.field),
    ).map((entry) => entry.id);

    expect(missing).toEqual([]);
  });

  it("keeps the retired one honest", () => {
    // call_point_id has no field because the Call Point / Concierge surface is
    // retired and serves 404. If somebody revives that surface, this fails and
    // the registry has to be updated deliberately rather than drifting.
    const retired = CANONICAL_IDS.filter(
      (entry) => entry.status === "retired_surface",
    );

    expect(retired.map((entry) => entry.id)).toEqual(["call_point_id"]);
    expect(declaresField(contractsSource(), "callPointId")).toBe(false);
  });
});
