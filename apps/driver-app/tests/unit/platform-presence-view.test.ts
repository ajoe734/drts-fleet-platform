import { describe, expect, it } from "vitest";

import {
  canReceiveOrders,
  deriveBlockingReasons,
  getEligibilityLabel,
  getPlatformReauthMechanism,
  getPlatformReauthUrl,
  isRealPlatformPresence,
  resolveEmptyReason,
  type PlatformPresenceViewSummary,
} from "../../lib/platform-presence-view";

const baseRecord = {
  driverId: "driver-001",
  platformCode: "uber" as const,
  accountId: "acct-001",
  status: "online" as const,
  eligibility: "eligible" as const,
  tokenExpiresAt: "2099-01-01T00:00:00.000Z",
  reauthRequired: false,
  lastOnlineAt: "2026-05-27T00:00:00.000Z",
  lastOfflineAt: null,
  lastHeartbeatAt: "2026-05-27T00:00:00.000Z",
  updatedAt: "2026-05-27T00:00:00.000Z",
};

describe("platform-presence-view helpers", () => {
  it("maps fallback reauth mechanisms per platform", () => {
    expect(getPlatformReauthMechanism(baseRecord)).toBe(
      "external_browser_oauth",
    );
    expect(
      getPlatformReauthMechanism({ ...baseRecord, platformCode: "grab" }),
    ).toBe("native_app_deeplink");
    expect(
      getPlatformReauthMechanism({ ...baseRecord, platformCode: "line-taxi" }),
    ).toBe("manual_credential");
    expect(
      getPlatformReauthMechanism({
        ...baseRecord,
        platformCode: "grab_taiwan",
      }),
    ).toBe("ops_managed");
  });

  it("offers a sign-in target only when the API sends one", () => {
    // The API sends no targets today, so every platform falls back to
    // telling the driver to contact dispatch.
    expect(getPlatformReauthUrl(baseRecord)).toBeNull();
    expect(
      getPlatformReauthUrl({ ...baseRecord, platformCode: "grab" }),
    ).toBeNull();
    expect(
      getPlatformReauthUrl({
        ...baseRecord,
        reauthUrl: "https://auth.example.test/uber",
      }),
    ).toBe("https://auth.example.test/uber");
    expect(
      getPlatformReauthUrl({
        ...baseRecord,
        platformCode: "grab",
        nativeAppUrl: "grab://reauth",
      }),
    ).toBe("grab://reauth");
    expect(
      getPlatformReauthUrl({
        ...baseRecord,
        platformCode: "line-taxi",
        reauthUrl: "https://auth.example.test/line",
      }),
    ).toBeNull();
  });

  it("treats only bound accounts and busy reports as platforms", () => {
    expect(isRealPlatformPresence(baseRecord)).toBe(true);
    // Leftovers of the old in-app bind form and on/off toggles.
    expect(
      isRealPlatformPresence({
        ...baseRecord,
        accountId: null,
        status: "offline",
      }),
    ).toBe(false);
    expect(
      isRealPlatformPresence({
        ...baseRecord,
        accountId: "  ",
        status: "online",
      }),
    ).toBe(false);
    expect(
      isRealPlatformPresence({
        ...baseRecord,
        accountId: null,
        status: "busy",
      }),
    ).toBe(true);
  });

  it("labels eligibility in plain words", () => {
    expect(getEligibilityLabel("eligible")).toBe("可接單");
    expect(getEligibilityLabel("pending")).toBe("審核中");
    expect(getEligibilityLabel("ineligible")).toBe("不符資格");
  });

  it("derives blocking reasons from legacy presence fields", () => {
    expect(
      deriveBlockingReasons(
        {
          ...baseRecord,
          accountId: null,
          status: "offline",
          reauthRequired: true,
          eligibility: "ineligible",
          ineligibleReasons: ["缺少營業證件"],
        },
        {
          platformCode: "uber",
          status: "degraded",
          blockingReason: "平台同步延遲",
          lastSyncAt: null,
        },
      ),
    ).toEqual(
      expect.arrayContaining([
        "尚未綁定平台帳號",
        "平台目前為離線",
        "需要重新授權",
        "目前不符合派單資格",
        "缺少營業證件",
        "平台同步延遲",
      ]),
    );
    expect(
      deriveBlockingReasons({
        ...baseRecord,
        tokenExpiresAt: "2020-01-01T00:00:00.000Z",
      }),
    ).toEqual(["授權已過期"]);
    expect(deriveBlockingReasons({ ...baseRecord, status: "busy" })).toEqual([
      "正在這個平台載客",
    ]);
  });

  it("prefers explicit canReceiveOrders and otherwise infers from presence status", () => {
    expect(
      canReceiveOrders(
        { ...baseRecord, canReceiveOrders: true },
        {
          platformCode: "uber",
          status: "down",
          blockingReason: "ignored because explicit override",
          lastSyncAt: null,
        },
      ),
    ).toBe(true);

    expect(
      canReceiveOrders(baseRecord, {
        platformCode: "uber",
        status: "healthy",
        blockingReason: null,
        lastSyncAt: null,
      }),
    ).toBe(true);

    expect(
      canReceiveOrders(
        { ...baseRecord, eligibility: "ineligible" },
        {
          platformCode: "uber",
          status: "healthy",
          blockingReason: null,
          lastSyncAt: null,
        },
      ),
    ).toBe(false);
  });

  it("resolves empty states distinctly", () => {
    const summary: PlatformPresenceViewSummary = {
      driverId: "driver-001",
      presences: [{ ...baseRecord, eligibility: "ineligible" }],
      adapterStatuses: [
        {
          platformCode: "uber",
          status: "healthy",
          blockingReason: null,
          lastSyncAt: null,
        },
      ],
    };

    expect(
      resolveEmptyReason({
        isProvisioned: false,
        summary: null,
        filteredCount: 0,
      }),
    ).toBe("not_provisioned");

    expect(
      resolveEmptyReason({
        isProvisioned: true,
        summary: null,
        filteredCount: 0,
        permissionDenied: true,
      }),
    ).toBe("permission_denied");

    expect(
      resolveEmptyReason({
        isProvisioned: true,
        summary,
        filteredCount: 0,
      }),
    ).toBe("filtered_empty");

    expect(
      resolveEmptyReason({
        isProvisioned: true,
        summary: {
          ...summary,
          presences: [
            { ...baseRecord, platformCode: "grab", eligibility: "eligible" },
          ],
          adapterStatuses: [
            {
              platformCode: "grab",
              status: "down",
              blockingReason: "平台轉接中斷",
              lastSyncAt: null,
            },
          ],
        },
        filteredCount: 1,
      }),
    ).toBe("external_unavailable");

    expect(
      resolveEmptyReason({
        isProvisioned: true,
        summary,
        filteredCount: 1,
      }),
    ).toBe("driver_not_eligible");

    // Healthy bindings are not an empty state; the screen lists them.
    expect(
      resolveEmptyReason({
        isProvisioned: true,
        summary: { ...summary, presences: [baseRecord] },
        filteredCount: 1,
      }),
    ).toBeNull();
  });
});
