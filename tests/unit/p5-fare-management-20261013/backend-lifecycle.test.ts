import { describe, expect, it } from "vitest";
import {
  command,
  deferred,
  filed,
  fixture,
  identity,
  NOW,
  seed,
} from "./backend-fixture";

function code(name: string) {
  return { code: name };
}
describe("actual public fare management service/controllers", () => {
  it("reads the approved authority with whole TWD units and no fabricated filing reference", async () => {
    const f = fixture();
    const list = (await f.controller.list()).data;
    expect(list.evaluatedAt).toBe(NOW);
    expect(list.activeFareVersionId).toBe("taipei-20230401");
    expect(list.items[0]).toMatchObject({
      status: "active",
      revision: 0,
      authorityFilingRef: null,
      filingEvidenceReference: null,
      currency: "TWD",
      nightSurchargeUnit: "TWD_per_trip",
      tariff: {
        baseFare: 85,
        baseDistanceMeters: 1250,
        distanceRate: 5,
        distanceIncrementMeters: 200,
        delayRate: 5,
        delayIncrementSeconds: 60,
        nightSurchargeAmount: 20,
      },
      availableActions: {
        edit: false,
        file: false,
        schedule: false,
        retire: false,
      },
    });
  });
  it("creates and edits an explicit draft while preserving current authority and named additional fees", async () => {
    const f = fixture();
    const input = command();
    input.tariff.additionalFees = { airport_fee: 60, 中文費目: 5 };
    const draft = (await f.controller.create(input, identity, "create")).data;
    const edited = (
      await f.controller.update(
        draft.fareVersionId,
        {
          ...input,
          expectedRevision: draft.revision,
          displayName: "Edited draft",
          tariff: { ...input.tariff, baseFare: 90 },
        },
        identity,
        "edit",
      )
    ).data;
    expect(edited).toMatchObject({
      status: "draft",
      revision: 2,
      displayName: "Edited draft",
      tariff: {
        baseFare: 90,
        additionalFeeEntries: [
          { key: "airport_fee", amount: 60 },
          { key: "中文費目", amount: 5 },
        ],
      },
    });
    expect(
      f.state().records.find((x) => x.tariff.version === "taipei-20230401"),
    ).toEqual(seed());
    expect((await f.controller.list()).data.activeFareVersionId).toBe(
      "taipei-20230401",
    );
  });
  it.each([
    { tariff: { ...command().tariff, baseFare: -1 } },
    { tariff: { ...command().tariff, delayIncrementSeconds: 0 } },
    { tariff: { ...command().tariff, nightSurchargeWindowEnd: "23:00" } },
    { effectiveFrom: "2026-10-20T00:00:00" },
    { effectiveFrom: "2026-02-30T00:00:00.000Z" },
    { tariff: { ...command().tariff, baseFare: 2_147_483_648 } },
    { effectiveFrom: "2026-10-20T24:00:00.000Z" },
    { tariff: { ...command().tariff, additionalFees: { airport_fee: -5 } } },
  ])("rejects invalid draft values without writes (%j)", async (patch) => {
    const f = fixture();
    await expect(
      f.controller.create({ ...command(), ...patch }, identity, "bad"),
    ).rejects.toMatchObject(code("fare_input_invalid"));
    expect(f.writes).toHaveLength(0);
  });
  it("requires real filing metadata and freezes the filed draft tariff", async () => {
    const f = fixture();
    const row = (await f.controller.create(command(), identity, "create")).data;
    await expect(
      f.controller.file(
        row.fareVersionId,
        {
          expectedRevision: row.revision,
          authorityFilingRef: "",
          filingEvidenceReference: "",
        },
        identity,
        "bad",
      ),
    ).rejects.toMatchObject(code("fare_filing_metadata_required"));
    const filedRow = (
      await f.controller.file(
        row.fareVersionId,
        {
          expectedRevision: row.revision,
          authorityFilingRef: "TEST-REF",
          filingEvidenceReference: "test://evidence",
        },
        identity,
        "file",
      )
    ).data;
    expect(filedRow).toMatchObject({
      status: "filed",
      publicationScheduled: false,
      filedBy: identity.actorId,
      filedAt: NOW,
    });
    await expect(
      f.controller.update(
        row.fareVersionId,
        { ...command(), expectedRevision: filedRow.revision },
        identity,
        "edit",
      ),
    ).rejects.toMatchObject(code("fare_lifecycle_conflict"));
    expect((await f.controller.list()).data.activeFareVersionId).toBe(
      "taipei-20230401",
    );
  });
  it("schedules, remains filed before its boundary, and retires the predecessor by server time", async () => {
    const f = fixture();
    const row = await filed(f, "future");
    const published = (
      await f.controller.schedule(
        "future",
        {
          expectedRevision: row.revision,
          effectiveFrom: "2026-10-20T00:00:00.000Z",
        },
        identity,
        "schedule",
      )
    ).data;
    expect(published).toMatchObject({
      status: "filed",
      publicationScheduled: true,
      scheduledFor: "2026-10-20T00:00:00.000Z",
    });
    expect((await f.controller.list()).data.activeFareVersionId).toBe(
      "taipei-20230401",
    );
    f.clock("2026-10-20T00:00:00.000Z");
    const list = (await f.controller.list()).data;
    expect(list.activeFareVersionId).toBe("future");
    expect(
      list.items.find((x) => x.fareVersionId === "taipei-20230401")?.status,
    ).toBe("retired");
    expect(f.state().records.every((x) => x.dbStatus === "published")).toBe(
      true,
    );
  });
  it("inserts before, between and after future schedules without gaps or retiring history", async () => {
    const f = fixture();
    for (const [id, at] of [
      ["B", "2026-10-20"],
      ["C", "2026-10-25"],
      ["D", "2026-10-15"],
      ["E", "2026-10-22"],
    ]) {
      const row = await filed(f, id!);
      await f.controller.schedule(
        id!,
        {
          expectedRevision: row.revision,
          effectiveFrom: `${at}T00:00:00.000Z`,
        },
        identity,
        `schedule-${id}`,
      );
    }
    const intervals = f
      .state()
      .records.filter((x) => x.dbStatus === "published")
      .sort(
        (a, b) =>
          Date.parse(a.tariff.effectiveAt) - Date.parse(b.tariff.effectiveAt),
      );
    expect(intervals.map((x) => x.tariff.version)).toEqual([
      "taipei-20230401",
      "D",
      "B",
      "E",
      "C",
    ]);
    intervals
      .slice(1)
      .forEach((x, i) =>
        expect(intervals[i]!.tariff.effectiveUntil).toBe(x.tariff.effectiveAt),
      );
    expect(intervals.at(-1)!.tariff.effectiveUntil).toBeNull();
  });
  it("replays a committed schedule to fresh state after a later successor without reapplying its interval", async () => {
    const f = fixture();
    const b = await filed(f, "B");
    const cmd = {
      expectedRevision: b.revision,
      effectiveFrom: "2026-10-20T00:00:00.000Z",
    };
    await f.controller.schedule("B", cmd, identity, "B-schedule");
    const c = await filed(f, "C");
    await f.controller.schedule(
      "C",
      {
        expectedRevision: c.revision,
        effectiveFrom: "2026-10-25T00:00:00.000Z",
      },
      identity,
      "C-schedule",
    );
    const before = f.state();
    const count = f.writes.length;
    const replay = (
      await f.controller.schedule("B", cmd, identity, "B-schedule")
    ).data;
    expect(replay.effectiveUntil).toBe("2026-10-25T00:00:00.000Z");
    expect(f.state()).toEqual(before);
    expect(f.writes).toHaveLength(count);
    await expect(
      f.controller.schedule(
        "B",
        { ...cmd, effectiveFrom: "2026-10-23T00:00:00.000Z" },
        identity,
        "B-schedule",
      ),
    ).rejects.toMatchObject(code("IDEMPOTENCY_KEY_REUSED"));
  });
  it("preserves edits on stale revision and reports the current revision", async () => {
    const f = fixture();
    const row = (await f.controller.create(command(), identity, "create")).data;
    await f.controller.update(
      row.fareVersionId,
      {
        ...command(),
        expectedRevision: row.revision,
        displayName: "First edit",
      },
      identity,
      "first",
    );
    await expect(
      f.controller.update(
        row.fareVersionId,
        {
          ...command(),
          expectedRevision: row.revision,
          displayName: "Stale edit",
        },
        identity,
        "second",
      ),
    ).rejects.toMatchObject(code("fare_revision_conflict"));
    expect((await f.controller.get(row.fareVersionId)).data.displayName).toBe(
      "First edit",
    );
  });
  it("rejects same-instant, backdated and unfiled schedules", async () => {
    const f = fixture();
    const b = await filed(f, "B");
    await f.controller.schedule(
      "B",
      {
        expectedRevision: b.revision,
        effectiveFrom: "2026-10-20T00:00:00.000Z",
      },
      identity,
      "B",
    );
    const c = await filed(f, "C");
    await expect(
      f.controller.schedule(
        "C",
        {
          expectedRevision: c.revision,
          effectiveFrom: "2026-10-20T00:00:00.000Z",
        },
        identity,
        "same",
      ),
    ).rejects.toMatchObject(code("fare_effective_time_conflict"));
    await expect(
      f.controller.schedule(
        "C",
        {
          expectedRevision: c.revision,
          effectiveFrom: "2026-10-01T00:00:00.000Z",
        },
        identity,
        "past",
      ),
    ).rejects.toMatchObject(code("fare_effective_time_conflict"));
    const draft = (
      await f.controller.create(command("draft"), identity, "draft")
    ).data;
    await expect(
      f.controller.schedule(
        "draft",
        { expectedRevision: draft.revision, effectiveFrom: null },
        identity,
        "unfiled",
      ),
    ).rejects.toMatchObject(code("fare_lifecycle_conflict"));
  });
  it("uses database time for immediate activation", async () => {
    const f = fixture();
    const row = await filed(f, "now");
    const activated = (
      await f.controller.schedule(
        "now",
        { expectedRevision: row.revision, effectiveFrom: null },
        identity,
        "now",
      )
    ).data;
    expect(activated).toMatchObject({
      status: "active",
      effectiveFrom: NOW,
      publicationScheduled: false,
    });
    expect((await f.controller.list()).data.activeFareVersionId).toBe("now");
  });
  it("requires replacement for current/future retirement and preserves historical reads after eligible retirement", async () => {
    const f = fixture();
    await expect(
      f.controller.retire(
        "taipei-20230401",
        { expectedRevision: 0, reason: "Stop" },
        identity,
        "stop",
      ),
    ).rejects.toMatchObject(code("fare_replacement_required"));
    const row = await filed(f, "future");
    const scheduled = (
      await f.controller.schedule(
        "future",
        {
          expectedRevision: row.revision,
          effectiveFrom: "2026-10-20T00:00:00.000Z",
        },
        identity,
        "future",
      )
    ).data;
    await expect(
      f.controller.retire(
        "future",
        { expectedRevision: scheduled.revision, reason: "Stop" },
        identity,
        "stop-future",
      ),
    ).rejects.toMatchObject(code("fare_replacement_required"));
    f.clock("2026-10-20T01:00:00.000Z");
    const historical = (await f.controller.get("taipei-20230401")).data;
    expect(
      (
        await f.controller.retire(
          historical.fareVersionId,
          { expectedRevision: historical.revision, reason: "Replaced" },
          identity,
          "retire-history",
        )
      ).data.status,
    ).toBe("retired");
    expect(
      f
        .state()
        .records.find((x) => x.tariff.version === historical.fareVersionId)
        ?.dbStatus,
    ).toBe("published");
  });
  it("retires an unpublished draft without changing current prices", async () => {
    const f = fixture();
    const row = (await f.controller.create(command(), identity, "create")).data;
    expect(
      (
        await f.controller.retire(
          row.fareVersionId,
          { expectedRevision: row.revision, reason: "Withdraw draft" },
          identity,
          "retire",
        )
      ).data.status,
    ).toBe("retired");
    expect((await f.controller.list()).data.activeFareVersionId).toBe(
      "taipei-20230401",
    );
  });
  it("holds HTTP success until commit and failed same-key retry performs a real write", async () => {
    const f = fixture();
    const gate = deferred();
    f.gates.push(gate);
    let settled = false;
    const first = f.controller
      .create(command(), identity, "create")
      .finally(() => {
        settled = true;
      });
    const observed = first.catch((x) => x);
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect((await f.controller.list()).data.items).toHaveLength(1);
    gate.reject(new Error("write rejected"));
    expect(await observed).toBeInstanceOf(Error);
    expect(f.receipts.size).toBe(0);
    expect(
      (await f.controller.create(command(), identity, "create")).data.status,
    ).toBe("draft");
    expect(f.writes).toHaveLength(1);
  });
  it("does not invent an active tariff for an empty database and permits first filed publication", async () => {
    const f = fixture([]);
    expect((await f.controller.list()).data.activeFareVersionId).toBeNull();
    const row = await filed(f, "first");
    await f.controller.schedule(
      "first",
      { expectedRevision: row.revision, effectiveFrom: null },
      identity,
      "first",
    );
    expect((await f.controller.list()).data.activeFareVersionId).toBe("first");
  });
  it("reports actual missing version and missing command key", async () => {
    const f = fixture();
    await expect(f.controller.get("missing")).rejects.toMatchObject(
      code("fare_version_not_found"),
    );
    await expect(
      f.controller.create(command(), identity),
    ).rejects.toMatchObject(code("IDEMPOTENCY_KEY_REQUIRED"));
  });
  it("reports overlapping current authority instead of selecting a convenient tariff", async () => {
    const a = seed();
    const b = seed();
    b.tariff.version = "overlap";
    const f = fixture([a, b]);
    await expect(f.controller.list()).rejects.toMatchObject(
      code("fare_timeline_conflict"),
    );
  });
});
