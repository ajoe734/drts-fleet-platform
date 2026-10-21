import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { databaseUrl, PostgresHarness } from "./postgres-harness";

describe.skipIf(!databaseUrl)("passenger push registry PostgreSQL", () => {
  const h = new PostgresHarness();
  beforeAll(() => h.open(), 120_000);
  afterAll(() => h.close());
  beforeEach(async () => {
    await h.reset();
    await h.entry();
  });

  it("enforces the partial active-token unique index and preserves rebind history", async () => {
    const first = await h.device("token-shared");
    const replay = await h.device("token-shared");
    expect(replay.deviceId).toBe(first.deviceId);
    expect(replay).not.toHaveProperty("token");
    await expect(
      h.pool.query(
        `INSERT INTO iam.phase1_passenger_push_devices
      (drts_passenger_id,platform,provider,app_id,app_version,token,token_sha256,notification_consent_version)
      SELECT drts_passenger_id,platform,provider,app_id,app_version,token,token_sha256,notification_consent_version
      FROM iam.phase1_passenger_push_devices WHERE device_id=$1`,
        [first.deviceId],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    const rebound = await h.device("token-shared", "new-passenger");
    expect(rebound.deviceId).not.toBe(first.deviceId);
    expect(
      (
        await h.pool.query(
          "SELECT status, token FROM iam.phase1_passenger_push_devices WHERE device_id=$1",
          [first.deviceId],
        )
      ).rows[0],
    ).toEqual({ status: "revoked", token: "token-shared" });
    expect(rebound).toMatchObject({
      status: "active",
      drtsPassengerId: "new-passenger",
      tokenSha256: first.tokenSha256,
    });
  });

  it("serializes same-token registrations across passengers without unique errors", async () => {
    const devices = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        h.device("racing-token", `passenger-${i}`),
      ),
    );
    expect(new Set(devices.map((d) => d.deviceId)).size).toBe(8);
    const rows = (
      await h.pool.query(
        "SELECT status, count(*)::int AS count FROM iam.phase1_passenger_push_devices GROUP BY status ORDER BY status",
      )
    ).rows;
    expect(rows).toEqual([
      { status: "active", count: 1 },
      { status: "revoked", count: 7 },
    ]);
  });

  it("rotates tokens atomically and rejects invalidation of an old hash", async () => {
    const old = await h.device("old-token");
    const current = await h.devices.registerDevice({
      drtsPassengerId: "passenger-qa",
      platform: "ios",
      provider: "fcm_v1",
      appId: "app-qa",
      appVersion: "2",
      token: "new-token",
      notificationConsentVersion: "v2",
      previousDeviceId: old.deviceId,
    });
    expect(current.deviceId).not.toBe(old.deviceId);
    expect(
      (
        await h.pool.query(
          "SELECT status,status_reason,token FROM iam.phase1_passenger_push_devices WHERE device_id=$1",
          [old.deviceId],
        )
      ).rows[0],
    ).toEqual({
      status: "revoked",
      status_reason: "token_rotated",
      token: "old-token",
    });
    expect(
      await h.devices.invalidateDevice(
        current.deviceId,
        "stale-result",
        old.tokenSha256,
      ),
    ).toMatchObject({ status: "active" });
    expect(
      await h.devices.invalidateDevice(
        current.deviceId,
        "provider_invalid",
        current.tokenSha256,
      ),
    ).toMatchObject({ status: "invalid", statusReason: "provider_invalid" });
    expect(await h.devices.touchDevice(current.deviceId)).toBeNull();
  });

  it("caps concurrent registration at ten and revokes the least recently seen", async () => {
    const old = await h.device("oldest");
    await h.pool.query(
      "UPDATE iam.phase1_passenger_push_devices SET registered_at=now()-interval '1 day' WHERE device_id=$1",
      [old.deviceId],
    );
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => h.device(`cap-${i}`)),
    );
    expect(
      (
        await h.pool.query(
          "SELECT count(*)::int AS n FROM iam.phase1_passenger_push_devices WHERE status='active'",
        )
      ).rows[0].n,
    ).toBe(10);
    expect(await h.devices.revokeDevice(old.deviceId)).toMatchObject({
      status: "revoked",
      statusReason: "active_device_cap_exceeded",
    });
  });

  it("cross-rebinding two full passengers does not deadlock or exceed either cap", async () => {
    for (let i = 0; i < 10; i++) {
      await h.device(`a-${i}`, "a");
      await h.device(`b-${i}`, "b");
    }
    await Promise.all([h.device("b-0", "a"), h.device("a-0", "b")]);
    const rows = (
      await h.pool.query(
        "SELECT drts_passenger_id, count(*)::int AS n FROM iam.phase1_passenger_push_devices WHERE status='active' GROUP BY drts_passenger_id",
      )
    ).rows;
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.n).toBeLessThanOrEqual(10);
  });

  it("excludes unseen, revoked, invalid, foreign-passenger and sixty-day stale devices", async () => {
    const fresh = await h.device("fresh");
    const stale = await h.device("stale");
    await h.device("unseen");
    const foreign = await h.device("foreign", "other");
    const revoked = await h.device("revoked");
    const invalid = await h.device("invalid");
    for (const device of [fresh, stale, foreign, revoked, invalid])
      await h.devices.touchDevice(device.deviceId);
    await h.pool.query(
      "UPDATE iam.phase1_passenger_push_devices SET last_seen_at=now()-interval '60 days 1 second' WHERE device_id=$1",
      [stale.deviceId],
    );
    await h.devices.revokeDevice(revoked.deviceId);
    await h.devices.invalidateDevice(invalid.deviceId, "provider_invalid");
    expect(
      (await h.devices.resolveActiveDevices("passenger-qa")).map(
        (d) => d.deviceId,
      ),
    ).toEqual([fresh.deviceId]);
    expect(await h.devices.revokeDevice(revoked.deviceId)).toMatchObject({
      statusReason: "logout",
    });
    expect(
      (
        await h.pool.query(
          "SELECT count(*)::int AS n FROM iam.phase1_passenger_push_devices",
        )
      ).rows[0].n,
    ).toBe(6);
  });

  it("rolls back a failed registration without exposing token data in its error", async () => {
    const old = await h.device("sensitive-old");
    await expect(
      h.devices.registerDevice({
        drtsPassengerId: "passenger-qa",
        platform: "invalid" as never,
        provider: "fcm_v1",
        appId: "app-qa",
        appVersion: "1",
        token: "sensitive-new",
        notificationConsentVersion: "v1",
        previousDeviceId: old.deviceId,
      }),
    ).rejects.toMatchObject({
      message: "passenger_push_device_operation_failed",
      code: "23514",
    });
    expect(
      (
        await h.pool.query(
          "SELECT status FROM iam.phase1_passenger_push_devices WHERE device_id=$1",
          [old.deviceId],
        )
      ).rows[0].status,
    ).toBe("active");
  });

  it("serializes first-party route replay and rejects changed immutable content", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        h.devices.writeFirstPartyRoute(h.firstRoute()),
      ),
    );
    expect(results.filter((r) => r.outcome === "created")).toHaveLength(1);
    expect(
      results.filter((r) => r.outcome === "idempotent_replay"),
    ).toHaveLength(7);
    expect(
      await h.devices.writeFirstPartyRoute({
        ...h.firstRoute(),
        drtsPassengerId: "other",
      }),
    ).toEqual({ outcome: "rejected_content_mismatch" });
    expect(
      await h.taxi.findOrderFirstPartyNotificationRoute("order-qa"),
    ).toMatchObject(h.firstRoute());
  });

  it("rejects a first-party route when the partner route exists", async () => {
    expect(
      await h.taxi.writeOrderPartnerNotificationRoute(h.partnerRoute()),
    ).not.toBeNull();
    expect(await h.devices.writeFirstPartyRoute(h.firstRoute())).toEqual({
      outcome: "rejected_partner_route_exists",
    });
    expect(
      await h.taxi.resolvePassengerNotificationChannel("order-qa"),
    ).toMatchObject({ channel: "partner_webhook" });
  });

  it("PG-QA-F1 rejects the reverse write through both production partner writers", async () => {
    for (const [orderId, writer] of [
      ["taxi", h.taxi],
      ["owned", h.owned],
    ] as const) {
      await h.devices.writeFirstPartyRoute(h.firstRoute(orderId));
      await writer.writeOrderPartnerNotificationRoute(h.partnerRoute(orderId));
      expect(
        await h.taxi.resolvePassengerNotificationChannel(orderId),
      ).toMatchObject({ channel: "first_party_app" });
      expect(
        (
          await h.pool.query(
            "SELECT * FROM mobility.phase1_partner_notification_sequences WHERE order_id=$1",
            [orderId],
          )
        ).rows,
      ).toHaveLength(0);
    }
  });

  it("PG-QA-F1 concurrent opposite-channel writers commit at most one route", async () => {
    await Promise.all([
      h.devices.writeFirstPartyRoute(h.firstRoute()),
      h.taxi.writeOrderPartnerNotificationRoute(h.partnerRoute()),
    ]);
    const result = await h.taxi.resolvePassengerNotificationChannel("order-qa");
    expect(["partner_webhook", "first_party_app"]).toContain(result.channel);
  });
});
