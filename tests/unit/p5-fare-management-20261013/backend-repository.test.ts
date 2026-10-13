import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import { FareVersionController } from "../../../apps/api/src/modules/multi-taxi/fare-versions/fare-version.controller";
import { FareVersionRepository } from "../../../apps/api/src/modules/multi-taxi/fare-versions/fare-version.repository";
import { FareVersionService } from "../../../apps/api/src/modules/multi-taxi/fare-versions/fare-version.service";
import { command, deferred, identity, NOW, seed } from "./backend-fixture";

function dbRow() {
  const t = seed().tariff;
  return {
    version: t.version,
    status: "published",
    effective_at: t.effectiveAt,
    effective_until: null,
    base_fare: t.baseFare,
    base_distance_meters: t.baseDistanceMeters,
    distance_rate: t.distanceRate,
    distance_increment_meters: t.distanceIncrementMeters,
    delay_rate: t.delayRate,
    delay_increment_seconds: t.delayIncrementSeconds,
    night_surcharge_amount: t.nightSurchargeAmount,
    night_window_start: t.nightSurchargeWindowStart,
    night_window_end: t.nightSurchargeWindowEnd,
    additional_fees: { airport_fee: 60 },
    distance_rounding: t.distanceRounding,
    delay_rounding: t.delayRounding,
    total_rounding: t.totalRounding,
    total_increment: t.totalIncrement,
    night_application: t.nightApplication,
    source_reference: t.sourceReference,
    created_at: seed().createdAt,
    display_name: null,
    public_summary: null,
    authority_filing_ref: null,
    filing_evidence_reference: null,
    filed_at: null,
    filed_by: null,
    revision: null,
    created_by: null,
    updated_by: null,
    updated_at: null,
    retired_reason: null,
  };
}
function repositoryFixture(
  options: {
    commit?: ReturnType<typeof deferred>;
    failReceipt?: boolean;
    connectError?: boolean;
  } = {},
) {
  const rows = [dbRow()];
  const events: string[] = [];
  const query = vi.fn(async (sql: string) => {
    const compact = sql.trim();
    events.push(compact);
    if (compact === "COMMIT" && options.commit) await options.commit.promise;
    if (compact.startsWith("WITH evaluated"))
      return { rows: [{ evaluated_at: NOW, records: rows }] };
    if (compact.startsWith("SELECT fare_version, payload_hash"))
      return { rows: [] };
    if (
      compact.startsWith(
        "INSERT INTO passenger.fare_version_command_receipts",
      ) &&
      options.failReceipt
    )
      throw new Error("receipt failed after fare/audit writes");
    return { rows: [] };
  });
  const release = vi.fn();
  const client = { query, release };
  const database = {
    query,
    connect: async () => {
      if (options.connectError) throw new Error("no storage");
      return client;
    },
  } as unknown as DatabaseService;
  const repository = new FareVersionRepository(database);
  const controller = new FareVersionController(
    new FareVersionService(repository),
  );
  return { controller, repository, query, events, release };
}
describe("actual fare repository transaction/transport boundary", () => {
  it("reads one joined statement snapshot and retains opaque fee identifiers and absent legacy metadata", async () => {
    const f = repositoryFixture();
    const data = (await f.controller.list()).data;
    expect(f.query).toHaveBeenCalledTimes(1);
    expect(data.items[0]).toMatchObject({
      revision: 0,
      authorityFilingRef: null,
      tariff: { additionalFeeEntries: [{ key: "airport_fee", amount: 60 }] },
    });
  });
  it("holds actual controller acknowledgement until transaction COMMIT finishes", async () => {
    const gate = deferred();
    const f = repositoryFixture({ commit: gate });
    let settled = false;
    const response = f.controller
      .create(command(), identity, "create")
      .finally(() => {
        settled = true;
      });
    await vi.waitFor(() => expect(f.events).toContain("COMMIT"));
    expect(settled).toBe(false);
    expect(f.release).not.toHaveBeenCalled();
    gate.resolve();
    expect((await response).data.status).toBe("draft");
    expect(f.release).toHaveBeenCalledOnce();
  });
  it("rejects a late receipt failure, rolls back instead of reporting success, and releases its client", async () => {
    const f = repositoryFixture({ failReceipt: true });
    await expect(
      f.controller.create(command(), identity, "create"),
    ).rejects.toMatchObject({ code: "fare_management_unavailable" });
    expect(
      f.events.some((x) => x.startsWith("INSERT INTO passenger.fare_versions")),
    ).toBe(true);
    expect(
      f.events.some((x) => x.startsWith("INSERT INTO admin.audit_logs")),
    ).toBe(true);
    expect(f.events).toContain("ROLLBACK");
    expect(f.events).not.toContain("COMMIT");
    expect(f.release).toHaveBeenCalledOnce();
  });
  it("propagates failed COMMIT as retryable unavailable rather than returning a draft", async () => {
    const gate = deferred();
    const f = repositoryFixture({ commit: gate });
    const result = f.controller
      .create(command(), identity, "create")
      .catch((x) => x);
    await vi.waitFor(() => expect(f.events).toContain("COMMIT"));
    gate.reject(new Error("commit failed"));
    expect(await result).toMatchObject({ code: "fare_management_unavailable" });
    expect(f.events).toContain("ROLLBACK");
    expect(f.release).toHaveBeenCalledOnce();
  });
  it("does not use fixture or in-memory official state when database connection is absent", async () => {
    const f = repositoryFixture({ connectError: true });
    await expect(
      f.controller.create(command(), identity, "create"),
    ).rejects.toMatchObject({ code: "fare_management_unavailable" });
    expect(f.query).not.toHaveBeenCalled();
  });
});
